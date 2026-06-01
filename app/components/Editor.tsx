"use client";

import utils from "../utils";
import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  Ref,
} from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { CodeMirrorV, ExParams, vim, Vim } from "@replit/codemirror-vim";
import { rust } from "@codemirror/lang-rust";

const DEFAULT_SOURCE = `// C Flat language example for "hello world"
// Currently a string is just a array of u8's.
extern C fn write_char(u8) void;
// Not used in this example but it is there for debugging
extern C fn write_int(s32) void;

// For now this is the only way to print a string.
// At some point we will have a built in way.
// For now this works
fn println(string: ref [u8]) void {
    let mut i: usize = 0;
    while i < string.len {
        write_char(string[i]);
        i = i + 1;
    }
    write_char(10);
}

pub fn main() void {
    println(&"Hello, World!");
    println(&
      // Raw strings
      \\Hello, World!
    );
}
`;

export interface EditorHandle {
  getValue: () => string;
  setValue: (source: string) => void;
}

type Props = {
  handleRun: () => void;
  vimKeysEnabled: boolean;
  currentFileName: string | null;
  setCurrentFileName: (name: string | null) => void;
  setVimMode: (mode: string) => void;
};

function Editor(props: Props, ref: Ref<EditorHandle>) {
  const {
    handleRun,
    vimKeysEnabled,
    currentFileName,
    setCurrentFileName,
    setVimMode,
  } = props;
  const [hash, setHash] = useState("");
  const vimCompartment = useRef(new Compartment()).current;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => viewRef.current?.state.doc.toString() ?? "",
    setValue: (source: string) => {
      if (!viewRef.current) return;
      const { state } = viewRef?.current;
      if (!state) return;
      const fullRange = { from: 0, to: state.doc.length };
      viewRef.current.dispatch({
        changes: { from: fullRange.from, to: fullRange.to, insert: source },
        selection: { anchor: source.length },
        scrollIntoView: true,
      });
    },
  }));

  useEffect(() => {
    const update = () => setHash(window.location.hash.replace(/^#/, ""));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (!hash) return;
    const view = viewRef?.current;
    if (!view) return;

    const data = atob(hash);
    utils
      .decompressString(data)
      .then((source) => {
        const { state } = view;
        const fullRange = { from: 0, to: state.doc.length };
        view.dispatch({
          changes: { from: fullRange.from, to: fullRange.to, insert: source },
          selection: { anchor: source.length },
          scrollIntoView: true,
        });
      })
      .catch((e) => console.error(e));
  }, [hash]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }
    viewRef.current.dispatch({
      effects: vimCompartment.reconfigure(vimKeysEnabled ? vim() : []),
    });
  }, [vimKeysEnabled]);

  useEffect(() => {
    if (!containerRef.current) return;

    Vim.defineEx("write", "w", function (cm: CodeMirrorV, params: ExParams) {
      const source = viewRef.current?.state.doc.toString() ?? "";
      if (!params?.args?.length && !currentFileName) {
        throw new Error("E32: No file name");
      }

      if (params?.args?.[0] !== currentFileName) {
        setCurrentFileName(params?.args?.[0] ?? null);
      }

      if (!currentFileName && params?.args?.length === 1) {
        setCurrentFileName(params?.args?.[0]);
      }

      utils.compressString(source).then((cmp) => {
        localStorage.setItem(
          `file-${params?.args?.[0]}`,
          String.fromCharCode(...cmp),
        );
      });
    });

    Vim.defineEx("run", "r", handleRun);

    const state = EditorState.create({
      doc: localStorage.getItem("src") ?? DEFAULT_SOURCE,
      extensions: [
        vimCompartment.of(vimKeysEnabled ? vim() : []),
        rust(),
        oneDark,
        history(),
        lineNumbers(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
          ".cm-content": { padding: "8px 0" },
        }),
        EditorView.updateListener.of((value: ViewUpdate) => {
          // @ts-ignore
          const mode = value?.view?.cm?.state?.vim?.mode;
          if (mode) {
            setVimMode(mode);
          }
          if (!value.docChanged) {
            return;
          }
          const content = value.state.doc.toString();
          localStorage.setItem("src", content);
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => view.destroy();
  }, []);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

export default forwardRef<EditorHandle, Props>(Editor);
