export const setButtonStatus = (button: HTMLElement, status: string): void => {
    button.classList.remove("active");
    button.classList.remove("inactive");
    button.classList.remove("degraded");
    button.classList.add(status);
};

