
// Base64-encoded short notification sound
export const notificationSoundBase64 = "data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFzb25pY1N0dWRpb3MuY29tAFRYWFgAAAASAAADVGl0bGUAU3lzdGVtIEJlZXAAVFlFUgAAAAUAAA==";

export const playNotificationSound = () => {
  try {
    const audio = new Audio(notificationSoundBase64);
    audio.volume = 0.5;
    audio.play();
  } catch (error) {
    console.error("Error playing notification sound:", error);
  }
};
