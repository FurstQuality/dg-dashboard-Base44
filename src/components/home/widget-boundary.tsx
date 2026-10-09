import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

type Props = { label: string; children: ReactNode };
type State = { failed: boolean };

/**
 * Keeps one stuck side-rail widget from looking like empty space (or taking the
 * whole feed down with it). Each widget says which one failed and offers a retry.
 */
export class WidgetBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">{this.props.label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This didn&apos;t load. It won&apos;t affect the rest of your feed.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => this.setState({ failed: false })}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }
}
