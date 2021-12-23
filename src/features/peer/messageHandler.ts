import { AppThunk } from "../../app/store";
import { MessageHandler, Packet } from "./types";

const handlers: { [t: string]: MessageHandler } = {};

export function addMessageHandler(
  messageType: string,
  handler: (packet: Packet) => AppThunk
) {
  handlers[messageType] = handler;
}

export function handlePacket(packet: Packet): AppThunk {
  return handlers[packet.message.type](packet);
}

export function deleteMessageHandler(messageType: string) {
  delete handlers[messageType];
}
