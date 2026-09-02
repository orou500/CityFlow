import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseVast, fireUrl } from '../vastParser';

const SAMPLE_VAST = `<?xml version="1.0"?>
<VAST version="3.0">
  <Ad id="ad-1">
    <InLine>
      <AdSystem>Test</AdSystem>
      <Impression><![CDATA[https://t.example/imp/1]]></Impression>
      <Creatives>
        <Creative>
          <Linear>
            <Duration>00:00:30</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[https://t.example/start/1]]></Tracking>
              <Tracking event="complete"><![CDATA[https://t.example/complete/1]]></Tracking>
            </TrackingEvents>
            <MediaFiles>
              <MediaFile type="video/flv"><![CDATA[https://cdn.example/a.flv]]></MediaFile>
              <MediaFile type="video/webm"><![CDATA[https://cdn.example/a.webm]]></MediaFile>
              <MediaFile type="video/mp4"><![CDATA[https://cdn.example/a.mp4]]></MediaFile>
            </MediaFiles>
            <VideoClicks><ClickThrough><![CDATA[https://click.example/1]]></ClickThrough></VideoClicks>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
  <Ad id="ad-2">
    <InLine>
      <AdSystem>Test</AdSystem>
      <Impression>https://t.example/imp/2</Impression>
      <Creatives>
        <Creative>
          <Linear>
            <Duration>0:10</Duration>
            <TrackingEvents>
              <Tracking event="start">https://t.example/start/2</Tracking>
            </TrackingEvents>
            <MediaFiles>
              <MediaFile type="video/mp4">https://cdn.example/b.mp4</MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

describe('parseVast', () => {
  it('returns an empty array for empty or non-string input', () => {
    expect(parseVast('')).toEqual([]);
    expect(parseVast(null)).toEqual([]);
    expect(parseVast(undefined)).toEqual([]);
  });

  it('returns an empty array for malformed XML', () => {
    expect(parseVast('<VAST><Ad>')).toEqual([]);
  });

  it('parses multiple inline ads with duration, impressions and tracking', () => {
    const ads = parseVast(SAMPLE_VAST);
    expect(ads).toHaveLength(2);
    expect(ads[0].id).toBe('ad-1');
    expect(ads[0].durationSeconds).toBe(30);
    expect(ads[0].impressions).toEqual(['https://t.example/imp/1']);
    expect(ads[0].tracking.start).toEqual(['https://t.example/start/1']);
    expect(ads[0].tracking.complete).toEqual(['https://t.example/complete/1']);
    expect(ads[0].clickThrough).toBe('https://click.example/1');
  });

  it('ranks mp4/webm above flv regardless of document order', () => {
    const ads = parseVast(SAMPLE_VAST);
    expect(ads[0].media.map((m) => m.type)).toEqual(['video/mp4', 'video/webm', 'video/flv']);
    expect(ads[0].media[0].url).toBe('https://cdn.example/a.mp4');
  });

  it('supports seconds-only durations', () => {
    const ads = parseVast(SAMPLE_VAST);
    expect(ads[1].durationSeconds).toBe(10);
  });

  it('skips Wrapper-only ads', () => {
    const xml = `<VAST version="3.0">
      <Ad id="wrapped"><Wrapper><AdSystem>x</AdSystem><VASTAdTagURI>https://x/tag</VASTAdTagURI></Wrapper></Ad>
    </VAST>`;
    expect(parseVast(xml)).toEqual([]);
  });

  it('drops ads with no media files', () => {
    const xml = `<VAST version="3.0">
      <Ad id="empty"><InLine><AdSystem>x</AdSystem><Creatives><Creative><Linear><Duration>00:00:10</Duration></Linear></Creative></Creatives></InLine></Ad>
    </VAST>`;
    expect(parseVast(xml)).toEqual([]);
  });
});

describe('fireUrl', () => {
  let ImageSpy;
  beforeEach(() => {
    ImageSpy = vi.fn(function Image() {});
    globalThis.Image = ImageSpy;
  });
  afterEach(() => {
    delete globalThis.Image;
  });

  it('fires a beacon through an Image request', () => {
    fireUrl('https://t.example/beacon');
    expect(ImageSpy).toHaveBeenCalledTimes(1);
    const instance = ImageSpy.mock.instances[0];
    expect(instance.src).toBe('https://t.example/beacon');
  });

  it('ignores empty urls', () => {
    fireUrl('');
    fireUrl(null);
    expect(ImageSpy).not.toHaveBeenCalled();
  });
});
