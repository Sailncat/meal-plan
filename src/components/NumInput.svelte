<script lang="ts">
  import { parseInput, toInput } from '../lib/num';

  interface Props {
    value: number | null;
    onchange: (v: number | null) => void;
    label: string;
    placeholder?: string;
    disabled?: boolean;
    class?: string;
  }
  let { value, onchange, label, placeholder = '', disabled = false, class: cls = '' }: Props = $props();

  let focused = $state(false);
  let text = $state('');

  // Show outside changes (undo, import) unless the user is typing in this box.
  $effect(() => {
    const v = value;
    if (!focused) text = toInput(v);
  });
</script>

<input
  class="field num {cls}"
  type="text"
  inputmode="decimal"
  autocomplete="off"
  enterkeyhint="done"
  aria-label={label}
  {placeholder}
  {disabled}
  value={text}
  oninput={(e) => {
    text = e.currentTarget.value;
    onchange(parseInput(text));
  }}
  onfocus={(e) => {
    focused = true;
    e.currentTarget.select();
  }}
  onblur={() => {
    focused = false;
    text = toInput(value);
  }}
  onkeydown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  }}
/>
