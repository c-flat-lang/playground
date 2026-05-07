import { useEffect, useRef } from "react";

type Props = {
  menuToggle: () => void;
  toggleVim: () => void;
  vimKeysState: boolean;
  setCurrentFileName: (name: string) => void;
};

export default function Menu({
  menuToggle,
  toggleVim,
  vimKeysState,
  setCurrentFileName,
}: Props) {
  const ref = useRef(null);

  useEffect(() => {
    const handleOutSideClick = (event: Event) => {
      if (!ref.current?.contains(event.target)) {
        menuToggle();
      }
    };

    window.addEventListener("mousedown", handleOutSideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutSideClick);
    };
  }, [ref]);

  let files: string[] = [];
  let i = 0;
  for (i; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("file-")) {
      continue;
    }
    files.push(key.slice(5));
  }

  return (
    <div
      style={{ zIndex: 9999 }}
      className="
        fixed inset-0 w-fit bg-[#2d3743]
        border-r-2 border-[#3e3e3e]
        p-2 text-xs
        text-[#858585] font-mono"
      ref={ref}
    >
      <div>
        <button title="menu toggle" onClick={menuToggle}>
          <img
            src="./menu_icon.png"
            alt="menu icon"
            width="24px"
            height="24px"
          />
        </button>
      </div>
      <div>
        <input
          className="m-1"
          type="checkbox"
          onChange={toggleVim}
          {...{ checked: vimKeysState }}
        />
        <label>Use vim keys</label>
      </div>
      <div className="text-center">
        <hr className="m-3" />
        <span className="p-1">{!files.length && "No "}Files</span>
        <ol>
          {files.map((name) => (
            <li key={name} className="m-1 hover:outline-2">
              <button onClick={() => setCurrentFileName(name)}> {name}</button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
