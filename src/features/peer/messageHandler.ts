import { PeerMessage } from "./peerSlice";
import { AppThunk } from "../../app/store";

export type MessageHandler = (message: PeerMessage) => AppThunk;

const handlers: { [t: string]: MessageHandler } = {};

export function addMessageHandler(
  messageType: string,
  handler: (message: PeerMessage) => AppThunk
) {
  handlers[messageType] = handler;
}

export function handleMessage(message: PeerMessage): AppThunk {
  return handlers[message.type](message);
}

export function deleteMessageHandler(messageType: string) {
  delete handlers[messageType];
}
