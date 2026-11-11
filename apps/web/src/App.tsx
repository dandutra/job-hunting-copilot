import { NavLink, Route, Routes } from "react-router";
import "./app.css";
import { FeedScreen } from "./feed/FeedScreen";

function Placeholder({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p className="muted">Not built yet.</p>
    </main>
  );
}

export function App() {
  return (
    <>
      <nav className="topnav">
        <b>Job hunting copilot</b>
        <NavLink to="/" end>
          Feed
        </NavLink>
        <NavLink to="/labels">Label queue</NavLink>
        <NavLink to="/merges">Merge log</NavLink>
      </nav>
      <Routes>
        <Route element={<FeedScreen />}>
          <Route path="/" />
          <Route path="/postings/:id" />
        </Route>
        <Route path="/labels" element={<Placeholder title="Label queue" />} />
        <Route path="/merges" element={<Placeholder title="Merge log" />} />
        <Route
          path="/resumes/:id"
          element={<Placeholder title="Tailored resume review" />}
        />
        <Route path="*" element={<Placeholder title="Page not found" />} />
      </Routes>
    </>
  );
}
