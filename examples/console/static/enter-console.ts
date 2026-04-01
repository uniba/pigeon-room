/// <reference lib="dom" />

const button = document.querySelector<HTMLButtonElement>("#address-enter");
const input = document.querySelector<HTMLInputElement>("#address-input");
if (button && input) {
  button.addEventListener("click", () => {
    const { value } = input;
    if (value) {
      location.href = "/?address=" + value;
    }
  });
}
