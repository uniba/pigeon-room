/// <reference lib="dom" />

const button = document.querySelector<HTMLButtonElement>("#address-enter");
const addressInput = document.querySelector<HTMLInputElement>("#address-input");
const staticidInput = document.querySelector<HTMLInputElement>(
  "#staticid-input",
);

if (button && addressInput && staticidInput) {
  button.addEventListener("click", () => {
    const { value: address } = addressInput;
    const { value: staticid } = staticidInput;
    console.log({ address, staticid });
    if (address) {
      location.href = "/?address=" + address +
        (staticid ? `&staticid=${staticid}` : "");
    }
  });
}
