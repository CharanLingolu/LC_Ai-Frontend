export default function Home() {
  return (
    <div className="h-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm transition-colors">
      <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-slate-100">
        Welcome to LC_Ai 👋
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Choose a mode from the left sidebar to start:
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <li>• Prompt Engineer – improve and structure prompts</li>
        <li>• Text Tools – rewrite, summarize, explain</li>
        <li>• Friend Mode – chat as a temporary or permanent friend</li>
        <li>• Rooms – group chat with friends and AI</li>
        <li>• For better experience login or signup</li>
      </ul>
    </div>
  );
}
