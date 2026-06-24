import PageLoader from "@/components/app/PageLoader";

export default function Loading() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "var(--bg)"
    }}>
      <PageLoader message="Loading diagnostic briefs..." minHeight="60vh" />
    </div>
  );
}
