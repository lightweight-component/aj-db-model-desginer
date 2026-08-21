import { Message } from "view-ui-plus";

/** Displays a standard transient editor message. */
export function showFeedback(content: string, isError: boolean = false): void {
  if (isError) {
    Message.error(content);
  } else {
    Message.success(content);
  }
}
