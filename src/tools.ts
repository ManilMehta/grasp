export type ToolId = "rotate" | "scale" | "edit";

interface ToolDef {
  id: ToolId;
  label: string;
  hint: string;
  key: string;
}

const TOOLS: ToolDef[] = [
  { id: "rotate", label: "Rotate", hint: "Pinch + drag with your right hand to spin the shape.", key: "r" },
  { id: "scale", label: "Scale", hint: "Pinch and drag up/down to grow or shrink the shape.", key: "s" },
  { id: "edit", label: "Edit Points", hint: "Pinch on a corner (or the pink center) and drag to reshape.", key: "e" },
];

export interface ToolbarOptions {
  onSelect?: (tool: ToolId) => void;
  onReset?: () => void;
  initial?: ToolId;
}

export interface Toolbar {
  getActive: () => ToolId;
  setActive: (tool: ToolId) => void;
  getHint: (tool: ToolId) => string;
}

export function createToolbar(container: HTMLElement, options: ToolbarOptions = {}): Toolbar {
  const { onSelect, onReset, initial = "rotate" } = options;
  let active: ToolId = initial;

  const buttons = new Map<ToolId, HTMLButtonElement>();
  const hints = new Map<ToolId, string>(TOOLS.map((t) => [t.id, t.hint]));

  function setActive(tool: ToolId): void {
    active = tool;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === tool);
    onSelect?.(tool);
  }

  for (const tool of TOOLS) {
    const btn = document.createElement("button");
    btn.className = "tool-btn";
    btn.dataset.tool = tool.id;
    btn.title = `${tool.hint} (${tool.key.toUpperCase()})`;
    btn.innerHTML = `<span class="tool-label">${tool.label}</span><span class="tool-key">${tool.key.toUpperCase()}</span>`;
    btn.addEventListener("click", () => setActive(tool.id));
    buttons.set(tool.id, btn);
    container.appendChild(btn);
  }

  const resetBtn = document.createElement("button");
  resetBtn.className = "tool-btn reset";
  resetBtn.innerHTML = `<span class="tool-label">Reset</span>`;
  resetBtn.title = "Restore the original prism (0)";
  resetBtn.addEventListener("click", () => onReset?.());
  container.appendChild(resetBtn);

  window.addEventListener("keydown", (e) => {
    if (e.key === "0") {
      onReset?.();
      return;
    }
    const match = TOOLS.find((t) => t.key === e.key.toLowerCase());
    if (match) setActive(match.id);
  });

  setActive(active);

  return {
    getActive: () => active,
    setActive,
    getHint: (tool: ToolId) => hints.get(tool) ?? "",
  };
}
