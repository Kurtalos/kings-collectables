"use client";
import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Undo, Redo, Unlink } from "lucide-react";
import { safePageLink, type RichNode } from "@/lib/pages";
export function PageRichEditor({ value, onChange, compact = false }: { value: RichNode; onChange: (value: RichNode) => void; compact?: boolean }) {
  const [link, setLink] = useState(""), [error, setError] = useState("");
  const editor = useEditor({ immediatelyRender: false, shouldRerenderOnTransaction: true, extensions: [StarterKit.configure({ heading: compact ? false : { levels: [2,3] }, ...(compact ? { bulletList: false as const, orderedList: false as const, blockquote: false as const, horizontalRule: false as const, hardBreak: false as const } : {}), code: false, codeBlock: false, link: { openOnClick: false, autolink: false, linkOnPaste: false } })], content: value, editorProps: { attributes: { role: "textbox", "aria-label": "Section rich text", "aria-multiline": "true", class: "page-rich-content" } }, onUpdate: ({ editor }) => onChange(editor.getJSON() as RichNode) });
  if (!editor) return <p>Loading text editor…</p>;
  const actions = [
    { label: "Bold", icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Underline", icon: Underline, active: editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run() },
    { label: "Strike", icon: Strikethrough, active: editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    { label: "Bullet list", icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Quote", icon: Quote, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "Undo text edit", icon: Undo, run: () => editor.chain().focus().undo().run() },
    { label: "Redo text edit", icon: Redo, run: () => editor.chain().focus().redo().run() },
  ];
  return <div className="page-rich-editor"><div className="page-rich-toolbar" role="toolbar" aria-label="Text formatting">{!compact && <select aria-label="Text style" value={editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"} onChange={e => e.target.value === "p" ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: e.target.value === "h2" ? 2 : 3 }).run()}><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>}{actions.filter(a=>!compact || !["Bullet list","Numbered list","Quote"].includes(a.label)).map(action => <button type="button" key={action.label} aria-label={action.label} title={action.label} aria-pressed={action.active} onClick={action.run}><action.icon size={16}/></button>)}</div><EditorContent editor={editor}/><div className="page-rich-links"><input aria-label="Rich text link URL" placeholder="Select text, then enter /cards or https://…" value={link} onChange={e => setLink(e.target.value)}/><button type="button" onClick={() => { if (!safePageLink(link.trim())) { setError("Use a store path or HTTPS link."); return; } editor.chain().focus().extendMarkRange("link").setLink({ href: link.trim() }).run(); setError(""); }}>Apply link</button><button type="button" aria-label="Remove text link" onClick={() => editor.chain().focus().unsetLink().run()}><Unlink size={16}/></button></div>{error && <p role="alert">{error}</p>}</div>;
}
