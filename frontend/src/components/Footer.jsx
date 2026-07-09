export default function Footer() {
  return (
    <footer className="py-6 px-4 border-t border-border mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="font-bold text-base">
          <span className="text-blue-600 dark:text-blue-400">City</span>
          <span className="text-orange-500 dark:text-orange-400">Flow</span>
        </div>
        <div className="text-muted text-xs">&copy; {new Date().getFullYear()} CityFlow. All rights reserved.</div>
      </div>
    </footer>
  );
}
