import { decryptSecret } from "../lib/crypto";
import type { Assistant, AssistantAISettings, ChannelSettings } from "../types";

interface MediaDownload {
  buffer: Buffer;
  mimeType: string;
}

type AudioProvider = "openai" | "deepinfra";

export async function fetchWhatsAppMedia(settings: ChannelSettings, mediaId: string): Promise<MediaDownload | undefined> {
  const token = whatsappToken(settings);
  if (!token || !mediaId) return undefined;

  const version = process.env.META_GRAPH_VERSION || "v22.0";
  const metadata = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!metadata.ok) return undefined;

  const payload = await metadata.json() as { url?: string; mime_type?: string };
  if (!payload.url) return undefined;

  const media = await fetch(payload.url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!media.ok) return undefined;

  return {
    buffer: Buffer.from(await media.arrayBuffer()),
    mimeType: media.headers.get("content-type") || payload.mime_type || "application/octet-stream"
  };
}

export async function transcribeWhatsAppAudio(settings: ChannelSettings, mediaId: string) {
  const provider = audioProvider();
  const apiKey = audioApiKey(provider);
  if (!apiKey) return "";

  const media = await fetchWhatsAppMedia(settings, mediaId);
  if (!media) return "";

  const form = new FormData();
  form.append("model", transcriptionModel(provider));
  form.append("language", "es");
  if (provider === "deepinfra") form.append("response_format", "json");
  form.append("file", new Blob([blobBytes(media.buffer)], { type: media.mimeType }), filenameForMime(media.mimeType));

  const response = await fetch(transcriptionEndpoint(provider), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!response.ok) return "";

  const payload = await response.json() as { text?: string };
  return payload.text || "";
}

export async function sendWhatsAppAudio(assistant: Assistant, to: string, text: string) {
  const settings = assistant.channels.whatsapp;
  const token = whatsappToken(settings);
  const phoneNumberId = settings.credentials.phoneNumberId;
  const shouldSend = process.env.MAGNET_SEND_REAL_WHATSAPP === "true" && token && phoneNumberId;

  if (!shouldSend) {
    return { messageId: `mock-audio-${Date.now()}` };
  }

  const audio = await synthesizeSpeech(text, assistant.ai);
  if (!audio) return { messageId: "", error: "Audio could not be generated" };

  const version = process.env.META_GRAPH_VERSION || "v22.0";
  const upload = new FormData();
  upload.append("messaging_product", "whatsapp");
  upload.append("type", audio.mimeType);
  upload.append("file", new Blob([blobBytes(audio.buffer)], { type: audio.mimeType }), "magnet-reply.ogg");

  const uploadResponse = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: upload
  });
  if (!uploadResponse.ok) return { messageId: "", error: `Meta media upload error: ${uploadResponse.status}` };

  const uploadPayload = await uploadResponse.json() as { id?: string };
  if (!uploadPayload.id) return { messageId: "", error: "Meta media upload did not return an id" };

  const sendResponse = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: { id: uploadPayload.id }
    })
  });
  if (!sendResponse.ok) return { messageId: "", error: `Meta audio send error: ${sendResponse.status}` };

  const sent = await sendResponse.json() as { messages?: Array<{ id: string }> };
  return { messageId: sent.messages?.[0]?.id || "" };
}

async function synthesizeSpeech(text: string, ai: AssistantAISettings): Promise<MediaDownload | undefined> {
  const provider = audioProvider();
  const apiKey = audioApiKey(provider);
  if (!apiKey || !text.trim()) return undefined;

  const response = await fetch(speechEndpoint(provider), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: speechModel(provider),
      voice: speechVoice(provider, ai),
      input: text,
      speed: ai.voiceSpeed || 1,
      response_format: process.env.AUDIO_RESPONSE_FORMAT || "opus"
    })
  });
  if (!response.ok) return undefined;

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: mimeForAudioFormat(process.env.AUDIO_RESPONSE_FORMAT || "opus")
  };
}

function audioProvider(): AudioProvider {
  const configured = (process.env.AUDIO_PROVIDER || "").toLowerCase();
  if (configured === "deepinfra" || configured === "openai") return configured;
  if (process.env.DEEPINFRA_API_KEY) return "deepinfra";
  return "openai";
}

function audioApiKey(provider: AudioProvider) {
  return provider === "deepinfra" ? process.env.DEEPINFRA_API_KEY : process.env.OPENAI_API_KEY;
}

function transcriptionEndpoint(provider: AudioProvider) {
  return provider === "deepinfra"
    ? "https://api.deepinfra.com/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
}

function speechEndpoint(provider: AudioProvider) {
  return provider === "deepinfra"
    ? "https://api.deepinfra.com/v1/audio/speech"
    : "https://api.openai.com/v1/audio/speech";
}

function transcriptionModel(provider: AudioProvider) {
  return provider === "deepinfra"
    ? process.env.DEEPINFRA_STT_MODEL || "openai/whisper-large"
    : process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
}

function speechModel(provider: AudioProvider) {
  return provider === "deepinfra"
    ? process.env.DEEPINFRA_TTS_MODEL || "deepinfra/tts"
    : process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
}

function speechVoice(provider: AudioProvider, ai: AssistantAISettings) {
  if (provider === "deepinfra") return process.env.DEEPINFRA_TTS_VOICE || ai.voice || "alloy";
  return ai.voice || "alloy";
}

function mimeForAudioFormat(format: string) {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (format === "flac") return "audio/flac";
  return "audio/ogg";
}

function whatsappToken(settings: ChannelSettings) {
  return settings.credentials.permanentAccessTokenEncrypted
    ? decryptSecret(settings.credentials.permanentAccessTokenEncrypted)
    : "";
}

function filenameForMime(mimeType: string) {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "voice.mp3";
  if (mimeType.includes("wav")) return "voice.wav";
  return "voice.ogg";
}

function blobBytes(buffer: Buffer) {
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return bytes;
}
