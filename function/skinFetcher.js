const axios = require("axios");

const MOJANG_UUID_URL = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_PROFILE_URL = "https://sessionserver.mojang.com/session/minecraft/profile";

/**
 * Resolves a Java Edition username to full profile + skin info using
 * Mojang's public API (no auth required):
 *   1. username -> UUID              (api.mojang.com)
 *   2. UUID -> profile w/ textures   (sessionserver.mojang.com)
 * The `properties[0].value` in step 2 is base64-encoded JSON containing
 * the actual skin PNG URL, which we decode here.
 *
 * Returns { uuid, name, skinUrl, slim } or null if the username doesn't
 * exist. Throws on network/unexpected errors so the caller can show a
 * generic "try again later" message.
 */
async function fetchMojangSkin(username) {
  const uuidRes = await axios.get(`${MOJANG_UUID_URL}/${encodeURIComponent(username)}`, {
    timeout: 8000,
    validateStatus: (s) => s === 200 || s === 204 || s === 404,
  });

  if (uuidRes.status === 204 || uuidRes.status === 404 || !uuidRes.data?.id) {
    return null; // username not found / not taken
  }

  const { id: uuid, name } = uuidRes.data;

  const profileRes = await axios.get(`${MOJANG_PROFILE_URL}/${uuid}`, {
    timeout: 8000,
    validateStatus: (s) => s === 200 || s === 204 || s === 404,
  });

  if (profileRes.status !== 200 || !profileRes.data?.properties?.length) {
    return null;
  }

  const texturesProp = profileRes.data.properties.find((p) => p.name === "textures");
  if (!texturesProp) return null;

  const decoded = JSON.parse(Buffer.from(texturesProp.value, "base64").toString("utf8"));
  const skinUrl = decoded?.textures?.SKIN?.url || null;
  const slim = decoded?.textures?.SKIN?.metadata?.model === "slim";

  if (!skinUrl) return null;

  return { uuid, name, skinUrl, slim };
}

module.exports = { fetchMojangSkin };