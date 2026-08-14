# k3s Traefik Let's Encrypt HTTP Challenge (Production TLS Fix)

## Background

Production TLS on this cluster is served by the k3s-bundled Traefik (not cert-manager).
On 2026-08-13 the `sizops.co.il` domain had no valid Let's Encrypt certificate and
the OIDC SSO flow between CityFlow and SizOps could not complete: the SizOps OIDC
discovery endpoint is only reachable over a valid HTTPS origin.

Root cause: the running Traefik was started with ACME email + storage configured but
**no challenge type** (`challenge not specified`), so no certificate could ever be
obtained.

## Source of truth

k3s does NOT apply `HelmChartConfig` for the bundled Traefik here (`kubectl get
helmchartconfig traefik` → NotFound). The live configuration is the k3s Addon file:

```
/var/lib/rancher/k3s/server/manifests/traefik.yaml
```

k3s's helm-controller watches that file; changing it (checksum changes) triggers a
new `helm-install-traefik` Job and redeploys Traefik. **ArgoCD does not manage
kube-system/Traefik**, so this file is the single source of truth and any changes
must be made there directly.

## The fix

In the `traefik` HelmChart's `valuesContent` add a certificatesResolvers block with
an HTTP challenge on the `web` entrypoint:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@sizops.co.il
      storage: /data/acme.json
      httpChallenge:
        entryPoint: web
```

(The repo file `k8s/traefik/traefik-config.yml` mirrors the intent via
`additionalArguments` — it is documentation/reference only and is not what k3s
applies. Prefer the `valuesContent` form in the manifest so the values survive
chart upgrades.)

## Backup / restore

- Pre-change snapshot: `/root/traefik-backup-2026-08-13/` on the server
  (`deploy-traefik.yaml`, `helmcharts.yaml`, `helmchartconfigs.yaml`,
  `chart-values-traefik.yaml`, `manifests/`).
- Pre-fix manifest: `/root/traefik-backup-2026-08-13/traefik.yaml.orig`.
- Post-fix manifest sha256: `6e87dd1758ec73653cce29d3c43d3568a84d53e5b26d30a7ed46dc2052c5578a`.

## ACME startup race (important)

Traefik fires the ACME order at startup, before the Service LB endpoints are
published. On a restart, the first one or two validation attempts will fail with
`Connection refused` / `Invalid response from https://...: 404` (the redirect
middleware wins until the challenge handler is registered). This is transient.

To re-trigger an obtain while the pod is already stable (no restart), make a real
TLS config change that forces ACME re-evaluation — e.g. remove and re-add the
`traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt` annotation on
the ingress:

```bash
kubectl -n sizops annotate ingress sizops-tls "traefik.ingress.kubernetes.io/router.tls.certresolver-" --overwrite
sleep 15
kubectl -n sizops annotate ingress sizops-tls "traefik.ingress.kubernetes.io/router.tls.certresolver=letsencrypt" --overwrite
```

A plain annotation touch (e.g. `acme.retry=<ts>`) does NOT trigger a new obtain —
only an actual router TLS config change does. Renewals happen automatically via the
existing ACME store (`/data/acme.json`, persisted in the 128Mi PV).

## Verification

```bash
echo | openssl s_client -servername sizops.co.il -connect sizops.co.il:443 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates        # issuer = Let's Encrypt, CN = sizops.co.il
curl https://sizops.co.il/.well-known/openid-configuration   # issuer: https://sizops.co.il
kubectl -n kube-system logs deploy/traefik | grep -i acme    # "Cannot retrieve the ACME challenge" = normal probe noise
```

## Related

- OIDC discovery issuer is configured on the SizOps side via `OIDC_ISSUER` in
  `SizOps/deploy/k3s/base/configmap.yaml` (commit `9384a0f`).
- CityFlow `SIZOPS_OIDC_ISSUER` must match: `https://sizops.co.il`.
