import { FormEvent, useState } from "react";
import { ArrowUp } from "lucide-react";

export function QuickAdd({
  placeholder,
  onSubmit,
  button = "添加",
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  button?: string;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(value);
    setValue("");
  }

  return (
    <form className="quick-add" onSubmit={handleSubmit}>
      <input
        className="field quick-add-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
      />
      <button className="quick-add-submit" type="submit" aria-label={button} title={button}>
        <ArrowUp size={17} strokeWidth={2.2} />
      </button>
    </form>
  );
}
