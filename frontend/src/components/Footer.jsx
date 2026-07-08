export default function Footer() {
  return (
    <footer className="py-6 px-4 border-t border-border mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-emerald-600 dark:text-emerald-400 font-bold text-base">CityFlow</div>
        <div className="text-muted text-xs">
          &copy; {new Date().getFullYear()} CityFlow. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
