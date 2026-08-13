import { FormEvent, useState } from "react";

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
    <form className="stack" onSubmit={handleSubmit}>
      <input
        className="field"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
      />
      <button className="primary" type="submit">
        {button}
      </button>
    </form>
  );
}
