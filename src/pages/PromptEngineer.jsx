import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { callLCai } from "../utils/aiClient";

export default function PromptEngineer() {
  const { token } = useAuth();
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // New function to clear text
  const handleClear = () => {
    setInput("");
    setResult("");
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    setLoading(true);
    setResult("");

    try {
      const reply = await callLCai(
        "prompt_engineer",
        [
          {
            role: "user",
            content: text,
          },
        ],
        token
      );

      setResult(reply.content);
    } catch (err) {
      console.error(err);
      setResult("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-hidden">
      <h1 className="text-sm font-semibold mb-2">Prompt Engineer ✨</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 shrink-0">
        Describe what you want the AI to do, and LC_Ai will craft a powerful
        prompt for you.
      </p>

      {/* Form Area - Fixed Height for Input */}
      <form onSubmit={handleGenerate} className="space-y-3 mb-4 shrink-0">
        <textarea
          className="w-full h-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none overflow-y-auto"
          placeholder="Example: I want a prompt to generate app ideas for a student productivity app..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        {/* Buttons Row */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-blue-400"
          >
            {loading ? "Generating..." : "Generate Prompt"}
          </button>

          {/* New Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            disabled={loading || (!input && !result)}
            className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </form>

      {/* Result Area - Flex-1 to take remaining space + Scrollable */}
      <div className="flex-1 flex flex-col min-h-0 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3 text-sm">
        {result ? (
          <div className="flex-1 overflow-y-auto pr-2">
            <pre className="whitespace-pre-wrap text-slate-900 dark:text-slate-100 font-sans">
              {result}
            </pre>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your generated prompt will appear here.
          </p>
        )}
      </div>
    </div>
  );
}
