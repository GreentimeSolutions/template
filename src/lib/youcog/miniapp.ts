export const APP_URL = "https://template-eta-tan.vercel.app";
export const APP_DOMAIN = "template-eta-tan.vercel.app";

export const miniAppEmbed = {
  version: "1",
  imageUrl: `${APP_URL}/miniapp-embed.png`,
  button: {
    title: "Claim free YOUCOG",
    action: {
      type: "launch_frame",
      name: "Youcognito",
      url: `${APP_URL}/`,
      splashImageUrl: `${APP_URL}/miniapp-splash.png`,
      splashBackgroundColor: "#000000",
    },
  },
};
