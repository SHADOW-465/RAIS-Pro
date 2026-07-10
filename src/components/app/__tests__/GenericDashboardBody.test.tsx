/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import GenericDashboardBody from "../GenericDashboardBody";
import type { Dataset } from "@/lib/dataset/types";
import type { GenericDashboard } from "@/lib/dataset/dashboard";

const baseDataset: Dataset = {
  id: "ds1", signatureHash: "ds1", title: "Visual QC", columns: [], sources: [],
  totalRows: 10, recognizedStageId: "visual", recognitionConfidence: 0.6, recognitionBasis: "heuristic",
};
const emptyDashboard: GenericDashboard = {
  datasetId: "ds1", title: "Visual QC", dateRange: null, kpis: [], breakdowns: [], defectPareto: null,
};

describe("GenericDashboardBody recognition confidence", () => {
  it("shows a needs-review badge below 0.8 confidence", () => {
    render(<GenericDashboardBody d={emptyDashboard} dataset={baseDataset} rows={[]} onConfirmStage={jest.fn()} />);
    expect(screen.getByText(/needs review/i)).toBeInTheDocument();
  });

  it("does not show a needs-review badge at or above 0.8 confidence", () => {
    render(<GenericDashboardBody d={emptyDashboard} dataset={{ ...baseDataset, recognitionConfidence: 0.9 }} rows={[]} onConfirmStage={jest.fn()} />);
    expect(screen.queryByText(/needs review/i)).not.toBeInTheDocument();
  });

  it("calls onConfirmStage with the dataset id and stage id when the user confirms", () => {
    const onConfirmStage = jest.fn();
    render(<GenericDashboardBody d={emptyDashboard} dataset={baseDataset} rows={[]} onConfirmStage={onConfirmStage} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirmStage).toHaveBeenCalledWith("ds1", "visual");
  });

  it("renders nothing extra when no dataset is provided (static-render callers unaffected)", () => {
    render(<GenericDashboardBody d={emptyDashboard} />);
    expect(screen.queryByText(/needs review/i)).not.toBeInTheDocument();
  });
});
