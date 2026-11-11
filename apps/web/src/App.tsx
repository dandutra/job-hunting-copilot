import { NavLink, Route, Routes, useParams } from "react-router";
import "./app.css";

function Placeholder({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p className="muted">Not built yet.</p>
    </main>
  );
}

function PostingRoute() {
  const { id } = useParams();
  return <Placeholder title={`Posting ${id}`} />;
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
        <Route path="/" element={<Placeholder title="Feed" />} />
        <Route path="/postings/:id" element={<PostingRoute />} />
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
