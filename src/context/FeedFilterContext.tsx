import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type FeedFilterState = {
  keyword: string;
  topic?: string;
  rawPrompt?: string;
};

type FeedFilterContextType = {
  filter: FeedFilterState;
  setFilter: (value: FeedFilterState) => void;
};

const defaultState: FeedFilterState = {
  keyword: "",
  topic: undefined,
  rawPrompt: "",
};

const FeedFilterContext = createContext<FeedFilterContextType | undefined>(
  undefined
);

export function FeedFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<FeedFilterState>(defaultState);

  const value = useMemo(
    () => ({
      filter,
      setFilter,
    }),
    [filter]
  );

  return (
    <FeedFilterContext.Provider value={value}>
      {children}
    </FeedFilterContext.Provider>
  );
}

export function useFeedFilter() {
  const ctx = useContext(FeedFilterContext);
  if (!ctx) {
    throw new Error("useFeedFilter must be used inside FeedFilterProvider");
  }
  return ctx;
}

export function resetFeedFilter() {
  return { ...defaultState };
}
