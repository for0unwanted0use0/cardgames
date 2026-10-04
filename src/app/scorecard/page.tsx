import SiteNav from "../../components/SiteNav";

export default function ScorecardPage() {
  return <main><SiteNav current="scorecard" /><iframe className="scorepad" src="/card-table.html" title="Declare and Judgement scorepads" /></main>;
}
