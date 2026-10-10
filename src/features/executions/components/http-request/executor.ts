import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import ky, { type Options as KyOptions } from "ky";
import dns from "dns";
import net from "net";
import type { NodeExecutor } from "@/features/executions/types";
import { httpRequestChannel } from "@/inngest/channels/http-request";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  const safeString = new Handlebars.SafeString(jsonString);

  return safeString;
});

type HttpRequestData = {
  variableName?: string;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: string;
};

export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return true;
    }
    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 169.254.0.0/16 (Link-local & Cloud metadata e.g. 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;
    // Broadcast
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback ::1, Unspecified ::
    if (normalized === "::1" || normalized === "::") return true;

    // IPv4-mapped IPv6 address: ::ffff:192.0.2.128
    if (normalized.startsWith("::ffff:")) {
      const ipv4Part = normalized.slice(7);
      if (net.isIPv4(ipv4Part)) {
        return isPrivateOrReservedIp(ipv4Part);
      }
    }

    // Unique Local Address fc00::/7 (fc00... or fd00...)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

    // Link-Local Unicast fe80::/10 (fe80... to febf...)
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }

    // Multicast ff00::/8
    if (normalized.startsWith("ff")) return true;

    return false;
  }

  // Not a valid IP format
  return true;
}

export async function validateUrlForSsrf(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new NonRetriableError(`HTTP Request node: Invalid URL '${urlString}'`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new NonRetriableError(
      `HTTP Request node: Protocol '${parsed.protocol}' is forbidden. Only 'http:' and 'https:' are supported.`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject local and cloud metadata hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal" ||
    hostname === "instance-data"
  ) {
    throw new NonRetriableError(`HTTP Request node: Target host '${hostname}' is forbidden`);
  }

  // Check if hostname is directly an IP address
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new NonRetriableError(
        `HTTP Request node: Access to private or reserved IP address '${hostname}' is forbidden`
      );
    }
    return;
  }

  // Resolve hostname via DNS
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (err) {
    throw new NonRetriableError(
      `HTTP Request node: DNS resolution failed for host '${hostname}': ${(err as Error).message}`
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new NonRetriableError(
      `HTTP Request node: DNS resolution returned no addresses for host '${hostname}'`
    );
  }

  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new NonRetriableError(
        `HTTP Request node: Host '${hostname}' resolved to private or reserved IP address '${address}' which is forbidden`
      );
    }
  }
}

export const httpRequestExecutor: NodeExecutor<HttpRequestData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    httpRequestChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const result = await step.run(`http-request-${nodeId}`, async () => {
      if (!data.endpoint) {
        await publish(
          httpRequestChannel().status({
            nodeId,
            status: "error",
          }),
        );
        throw new NonRetriableError("HTTP Request node: No endpoint configured");
      }

      if (!data.variableName) {
        await publish(
          httpRequestChannel().status({
            nodeId,
            status: "error",
          }),
        );
        throw new NonRetriableError("HTTP Request node: Variable name not configured");
      }

      if (!data.method) {
        await publish(
          httpRequestChannel().status({
            nodeId,
            status: "error",
          }),
        );
        throw new NonRetriableError("HTTP Request node: Method not configured");
      }

      let endpoint: string;
      try {
        endpoint = Handlebars.compile(data.endpoint)(context);
      } catch (err) {
        throw new NonRetriableError(
          `HTTP Request node: Failed to compile endpoint template: ${(err as Error).message}`
        );
      }

      // Enforce SSRF protection before dispatching request
      await validateUrlForSsrf(endpoint);

      const method = data.method;
      const options: KyOptions = {
        method,
        redirect: "error", // Block redirect-based SSRF bypasses
        timeout: 30000,
      };

      if (["POST", "PUT", "PATCH"].includes(method)) {
        let resolved = "{}";
        try {
          resolved = Handlebars.compile(data.body || "{}")(context);
          JSON.parse(resolved);
        } catch (err) {
          throw new NonRetriableError(
            `HTTP Request node: Invalid JSON body template: ${(err as Error).message}`
          );
        }
        options.body = resolved;
        options.headers = {
          "Content-Type": "application/json",
        };
      }

      const response = await ky(endpoint, options);
      const contentType = response.headers.get("content-type");
      const responseData = contentType?.includes("application/json")
        ? await response.json()
        : await response.text();

      const responsePayload = {
        httpResponse: {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
        },
      };

      return {
        ...context,
        [data.variableName]: responsePayload,
      };
    });

    await publish(
      httpRequestChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    await publish(
      httpRequestChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
