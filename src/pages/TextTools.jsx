import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { callLCai } from "../utils/aiClient";

const TASKS = [
  { id: "rewrite", label: "Rewrite (better clarity)" },
  { id: "summarize", label: "Summarize" },
  { id: "fix_grammar", label: "Fix grammar" },
];

export default function TextTools() {
  const { token } = useAuth();
  const [task, setTask] = useState("rewrite");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  // --- NEW: Clear Function ---
  const handleClear = () => {
    setInput(""); // Clears the text area
    setOutput(""); // Clears the response/result area
  };

  const handleRun = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    setLoading(true);
    setOutput("");

    const prompt = `Task: ${task}. Text:\n\n${text}`;

    try {
      const reply = await callLCai(
        "text_tools",
        [{ role: "user", content: prompt }],
        token
      );
      setOutput(reply.content);
    } catch (err) {
      console.error(err);
      setOutput("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col md:grid md:grid-cols-2 gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-hidden">
      {/* Left: Input Section */}
      <div className="flex flex-col h-1/2 md:h-full min-h-0">
        <h1 className="text-sm font-semibold mb-2 shrink-0">Text Tools 🛠</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 shrink-0">
          Paste text and choose an operation.
        </p>

        <div className="flex items-center gap-2 mb-2 shrink-0">
          <label className="text-xs text-slate-600 dark:text-slate-300">
            Operation:
          </label>
          <select
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          >
            {TASKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleRun} className="flex-1 flex flex-col min-h-0">
          <textarea
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none overflow-y-auto mb-3"
            placeholder="Paste your text here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />

          {/* --- UPDATED: Buttons Container --- */}
          <div className="flex gap-2 shrink-0">
            <button
              type="button" // Important: type="button" prevents form submission
              onClick={handleClear}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Clear
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? "Processing..." : "Run"}
            </button>
          </div>
        </form>
      </div>

      {/* Right: Output Section */}
      <div className="flex flex-col h-1/2 md:h-full min-h-0">
        <h2 className="text-sm font-semibold mb-2 shrink-0">Result</h2>
        <div className="flex-1 flex flex-col min-h-0 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3 text-sm">
          {output ? (
            <div className="flex-1 overflow-y-auto pr-2">
              <pre className="whitespace-pre-wrap text-slate-900 dark:text-slate-100 font-sans">
                {output}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Processed text will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
