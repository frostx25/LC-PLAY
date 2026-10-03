import { useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

export function SearchField({ className, value, placeholder, onChange }: {
  className: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useLayoutEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const finishEditing = () => {
    restoreFocus.current = true;
    setEditing(false);
  };

  return (
    <div className={className} onClick={() => { if (!editing) setEditing(true); }}>
      <Search aria-hidden="true" />
      {editing ? (
        <input
          ref={inputRef}
          data-focusable
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            // Keep remote keys inside text editing until Done or Back is pressed.
            event.stopPropagation();
            if (event.key === "Enter" || event.key === "Escape" || event.keyCode === 461) {
              event.preventDefault();
              finishEditing();
            }
          }}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          data-focusable
          className={`search-trigger${value ? " has-value" : ""}`}
          aria-label={placeholder}
          onClick={() => setEditing(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setEditing(true);
            }
          }}
        >
          {value || placeholder}
        </button>
      )}
    </div>
  );
}
