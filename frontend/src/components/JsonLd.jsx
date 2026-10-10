import { headers } from "next/headers";

const JsonLd = async ({ data }) => (
  <script
    type="application/ld+json"
    nonce={(await headers()).get("x-nonce")}
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(data).replace(/</g, "\\u003c"),
    }}
  />
);

export default JsonLd;
