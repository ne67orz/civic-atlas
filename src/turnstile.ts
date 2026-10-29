declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}
let loading: Promise<void> | undefined;
export async function token(container: HTMLElement) {
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!sitekey)
    throw Error(
      "Live retrieval needs a configured Turnstile site key. Unverified simulation profiles are available.",
    );
  if (!window.turnstile) {
    loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.onload = () => resolve();
      script.onerror = () => reject(Error("Bot check unavailable"));
      document.head.appendChild(script);
    });
    await loading;
  }
  return new Promise<string>((resolve, reject) => {
    let widget = "";
    const timeout = setTimeout(() => {
      window.turnstile?.remove(widget);
      reject(Error("Bot check timed out"));
    }, 90000);
    widget = window.turnstile!.render(container, {
      sitekey,
      action: "candidate",
      callback: (value: string) => {
        clearTimeout(timeout);
        window.turnstile?.remove(widget);
        resolve(value);
      },
      "error-callback": () => {
        clearTimeout(timeout);
        window.turnstile?.remove(widget);
        reject(Error("Bot check failed"));
      },
      "expired-callback": () => {
        clearTimeout(timeout);
        reject(Error("Bot check expired"));
      },
    });
  });
}
