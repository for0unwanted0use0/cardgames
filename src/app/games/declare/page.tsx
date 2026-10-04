import SiteNav from "../../../components/SiteNav";
import OnlineDeclareGame from "../../../games/declare/components/OnlineDeclareGame";
import GameGuide from "../../../games/declare/components/GameGuide";

export default function DeclarePage() {
  return <main><SiteNav current="declare"><GameGuide settingsAvailable /></SiteNav><OnlineDeclareGame /></main>;
}
