import React from "react";
import { createRoot } from "react-dom/client";
import { BehaviorApp, type BehaviorView } from "./BehaviorApp";
import "./styles.css";

const el = document.getElementById("root")!;
const view = (el.dataset.behaviorView ?? "all") as BehaviorView;
createRoot(el).render(<BehaviorApp view={view} />);
