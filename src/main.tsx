import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource-variable/material-symbols-rounded/standard.css";
import App from "./App";
import "./styles/global.css";
import "./styles/focubili-m3.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // 带版本参数的注册地址确保旧 WebView 里的服务缓存会换新。
    navigator.serviceWorker.register("/sw.js?v=5").catch(() => {
      // 离线能力静默降级
    });
  });
}
