import React from "react";
import { useRoute } from "./router";
import { Explore } from "./Explore";
import { FindingPage } from "./FindingPage";
import { ArtifactPage } from "./ArtifactPage";

export function App() {
  const [route] = useRoute();

  if (route.path[0] === "f" && route.path[1]) {
    return <FindingPage findingId={route.path[1]} />;
  }
  if (route.path[0] === "a" && route.path[1]) {
    return <ArtifactPage artifactName={route.path[1]} />;
  }
  return <Explore route={route} />;
}
