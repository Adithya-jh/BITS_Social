import { useEffect, useState } from "react";
import { FiCpu } from "react-icons/fi";
import { useFeedFilter } from "../../context/FeedFilterContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

const TOPIC_DICTIONARY: Record<string, string[]> = {
  travel: ["travel", "trip", "vacation", "journey", "flight", "hotel", "beach", "tour", "wander"],
  career: ["job", "offer", "career", "promotion", "interview", "hiring", "work", "resume"],
  tech: ["tech", "technology", "software", "startup", "programming", "developer", "ai", "ml", "product"],
  sports: ["sport", "match", "game", "tournament", "goal", "team", "league", "cricket", "football"],
  food: ["food", "recipe", "cook", "meal", "dinner", "breakfast", "restaurant", "coffee"],
  wellness: ["health", "wellness", "gym", "workout", "mental", "yoga", "sleep", "meditation"],
  finance: ["invest", "stock", "crypto", "finance", "budget", "savings", "market"],
  education: ["study", "class", "exam", "research", "project", "lecture", "assignment"],
  entertainment: ["movie", "music", "concert", "series", "show", "song", "album"],
};

type PromptFilterMenuProps = { disabled?: boolean };

export function PromptFilterMenu({ disabled = false }: PromptFilterMenuProps) {
  const { filter, setFilter } = useFeedFilter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setPrompt(filter.rawPrompt ?? "");
      setError("");
    }
  }, [open, filter.rawPrompt]);

  const applyPrompt = () => {
    const parsed = parsePrompt(prompt);
    if (!parsed.keyword && !parsed.topic) {
      setError("Need a topic keyword");
      return;
    }
    setFilter({ keyword: parsed.keyword ?? "", topic: parsed.topic, rawPrompt: prompt.trim() });
    setOpen(false);
    setPrompt("");
    setError("");
    navigate("/home");
    toast.custom(
      <span className="text-sm text-white">Filter applied. Refresh the feed to return to the main view.</span>,
      { duration: 1500 }
    );
  };

  const clearFilter = () => {
    setFilter({ keyword: "", topic: undefined, rawPrompt: "" });
    setPrompt("");
    setOpen(false);
    setError("");
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`p-2 rounded-full transition-colors ${
          disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white/10 text-blue-200"
        } ${filter.keyword || filter.topic ? "text-(--color-main)" : "text-twitterText"}`}
        title={filter.keyword || filter.topic ? `Filter: ${filter.topic ?? filter.keyword}` : "Filter feed by prompt"}
      >
        <FiCpu />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg mx-4 rounded-3xl border border-(--color-main) bg-[#05070d]/90 p-6 text-white shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <p className="text-base font-semibold">Prompt Filter</p>
              <button type="button" className="text-sm text-twitterTextAlt hover:text-white" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p className="text-xs text-twitterTextAlt mb-3">
              Describe the feed you want—we'll detect a topic keyword and adjust your timeline.
            </p>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError("");
              }}
              className="w-full h-28 rounded-2xl bg-[#11141f] border border-white/10 text-sm text-twitterText px-3 py-2 focus:outline-none focus:border-(--color-main)"
              placeholder="Show me travel posts about beaches"
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

            <div className="flex justify-between items-center mt-5">
              <button type="button" className="text-xs text-twitterTextAlt hover:text-white" onClick={clearFilter}>
                Clear filter
              </button>
              <button type="button" onClick={applyPrompt} className="px-4 py-2 rounded-2xl bg-(--color-main) text-black text-sm font-semibold">
                Search
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parsePrompt(input: string) {
  const cleaned = input.trim();
  if (!cleaned) {
    return { keyword: "", topic: undefined };
  }
  const lowered = cleaned.toLowerCase();
  let detectedTopic: string | undefined;
  Object.entries(TOPIC_DICTIONARY).forEach(([topic, terms]) => {
    if (terms.some((term) => lowered.includes(term))) {
      detectedTopic = topic;
    }
  });

  let keyword = cleaned
    .replace(/^(show|display|give|let me see|filter|only|please)/i, "")
    .replace(/(posts|tweets|feed|timeline)/gi, "")
    .replace(/with keywords?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!keyword && detectedTopic) keyword = detectedTopic;
  return { keyword, topic: detectedTopic };
}
