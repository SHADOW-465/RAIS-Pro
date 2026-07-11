/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import StageConfirmPicker from "../StageConfirmPicker";

const knownStages = [
  { stageId: "visual", label: "Visual Inspection" },
  { stageId: "final", label: "Final Inspection" },
];

describe("StageConfirmPicker", () => {
  it("defaults to the guessed stage and confirms it unchanged", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="visual" knownStages={knownStages} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("ds1", "visual");
  });

  it("lets the user pick a different known stage", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="visual" knownStages={knownStages} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "final" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("ds1", "final");
  });

  it("reveals a text input for '+ New stage…' and confirms the typed label", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="unrecognized-guess" knownStages={knownStages} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByPlaceholderText(/new stage name/i), { target: { value: "Cutting" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith("ds1", "Cutting");
  });

  it("disables Confirm when '+ New stage…' is selected but nothing is typed", () => {
    const onConfirm = jest.fn();
    render(<StageConfirmPicker datasetId="ds1" defaultStageId="unrecognized-guess" knownStages={knownStages} onConfirm={onConfirm} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });
});
