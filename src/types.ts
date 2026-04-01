export interface PointStyle {
  color: string;
  radius: number;
  opacity: number;
}

export interface LineStyle {
  color: string;
  width: number;
  opacity: number;
}

export interface FillStyle {
  color: string;
  opacity: number;
}

export interface MapStyleState {
  point: PointStyle;
  line: LineStyle;
  fill: FillStyle;
}

export interface ToolCallResult {
  success: boolean;
  message: string;
  style?: MapStyleState;
}
