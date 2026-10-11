import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isPrivateOrReservedIp,
  validateUrlForSsrf,
} from "../src/features/executions/components/http-request/executor";

describe("SSRF Protection Audit (Direct Production Module Testing)", () => {
  describe("IPv4 Boundary Classification", () => {
    test("blocks IPv4 loopback (127.0.0.1, 127.0.0.2, 127.255.255.254)", () => {
      assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("127.0.0.2"), true);
      assert.equal(isPrivateOrReservedIp("127.255.255.254"), true);
    });

    test("blocks RFC1918 Class A private (10.0.0.1, 10.255.255.255)", () => {
      assert.equal(isPrivateOrReservedIp("10.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("10.254.1.1"), true);
    });

    test("blocks RFC1918 Class B private (172.16.0.1 to 172.31.255.255)", () => {
      assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);
      assert.equal(isPrivateOrReservedIp("172.24.1.1"), true);
      assert.equal(isPrivateOrReservedIp("172.31.255.255"), true);
      // Public 172 range should not be blocked
      assert.equal(isPrivateOrReservedIp("172.32.0.1"), false);
      assert.equal(isPrivateOrReservedIp("172.15.255.255"), false);
    });

    test("blocks RFC1918 Class C private (192.168.0.1, 192.168.254.254)", () => {
      assert.equal(isPrivateOrReservedIp("192.168.0.1"), true);
      assert.equal(isPrivateOrReservedIp("192.168.1.100"), true);
    });

    test("blocks cloud metadata & link-local (169.254.169.254, 169.254.1.1)", () => {
      assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
      assert.equal(isPrivateOrReservedIp("169.254.0.1"), true);
    });

    test("blocks current network (0.0.0.0)", () => {
      assert.equal(isPrivateOrReservedIp("0.0.0.0"), true);
    });

    test("blocks Carrier-Grade NAT (100.64.0.1, 100.127.255.255)", () => {
      assert.equal(isPrivateOrReservedIp("100.64.0.1"), true);
      assert.equal(isPrivateOrReservedIp("100.127.255.255"), true);
      assert.equal(isPrivateOrReservedIp("100.128.0.1"), false);
    });

    test("blocks multicast & reserved (224.0.0.1, 240.0.0.1, 255.255.255.255)", () => {
      assert.equal(isPrivateOrReservedIp("224.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("240.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("255.255.255.255"), true);
    });

    test("allows legitimate public IPv4 addresses", () => {
      assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
      assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
      assert.equal(isPrivateOrReservedIp("93.184.216.34"), false); // example.com
    });
  });

  describe("IPv6 Boundary Classification", () => {
    test("blocks IPv6 loopback (::1) and unspecified (::)", () => {
      assert.equal(isPrivateOrReservedIp("::1"), true);
      assert.equal(isPrivateOrReservedIp("::"), true);
    });

    test("blocks IPv4-mapped IPv6 loopback & private (::ffff:127.0.0.1, ::ffff:169.254.169.254)", () => {
      assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("::ffff:169.254.169.254"), true);
      assert.equal(isPrivateOrReservedIp("::ffff:10.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("::ffff:8.8.8.8"), false);
    });

    test("blocks IPv6 Unique Local Addresses (fc00::1, fd12::34)", () => {
      assert.equal(isPrivateOrReservedIp("fc00::1"), true);
      assert.equal(isPrivateOrReservedIp("fd00::1234"), true);
    });

    test("blocks IPv6 Link-Local Addresses (fe80::1)", () => {
      assert.equal(isPrivateOrReservedIp("fe80::1"), true);
    });

    test("blocks IPv6 Multicast (ff02::1)", () => {
      assert.equal(isPrivateOrReservedIp("ff02::1"), true);
    });
  });

  describe("validateUrlForSsrf Production Function", () => {
    test("rejects forbidden schemes (file://, ftp://, gopher://)", async () => {
      await assert.rejects(
        () => validateUrlForSsrf("file:///etc/passwd"),
        /Protocol 'file:' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("ftp://ftp.example.com"),
        /Protocol 'ftp:' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("gopher://gopher.example.com"),
        /Protocol 'gopher:' is forbidden/,
      );
    });

    test("rejects localhost and dangerous internal domain patterns", async () => {
      await assert.rejects(
        () => validateUrlForSsrf("http://localhost:3000/api"),
        /Target host 'localhost' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://foo.localhost/api"),
        /Target host 'foo.localhost' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://service.local/data"),
        /Target host 'service.local' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://db.internal/query"),
        /Target host 'db.internal' is forbidden/,
      );
      await assert.rejects(
        () =>
          validateUrlForSsrf(
            "http://metadata.google.internal/computeMetadata/v1/",
          ),
        /Target host 'metadata.google.internal' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://instance-data/latest/meta-data"),
        /Target host 'instance-data' is forbidden/,
      );
    });

    test("rejects direct private IP URLs", async () => {
      await assert.rejects(
        () => validateUrlForSsrf("http://127.0.0.1:8080"),
        /Access to private or reserved IP address '127.0.0.1' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://169.254.169.254/latest/meta-data/"),
        /Access to private or reserved IP address '169.254.169.254' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://10.0.0.1"),
        /Access to private or reserved IP address '10.0.0.1' is forbidden/,
      );
      await assert.rejects(
        () => validateUrlForSsrf("http://192.168.1.1"),
        /Access to private or reserved IP address '192.168.1.1' is forbidden/,
      );
    });

    test("allows valid public IP URLs directly without DNS lookup", async () => {
      await assert.doesNotReject(() =>
        validateUrlForSsrf("https://8.8.8.8/dns-query"),
      );
      await assert.doesNotReject(() => validateUrlForSsrf("https://1.1.1.1/"));
    });
  });

  describe("Outbound Webhook Executors SSRF Enforcement (Discord & Slack)", () => {
    test("discordExecutor and slackExecutor enforce validateUrlForSsrf and block internal/metadata webhook targets", async () => {
      const { discordExecutor } = await import(
        "../src/features/executions/components/discord/executor"
      );
      const { slackExecutor } = await import(
        "../src/features/executions/components/slack/executor"
      );

      const mockPublish = (async () => ({})) as unknown as Parameters<
        typeof discordExecutor
      >[0]["publish"];
      const mockStep = {
        run: async <T>(_id: string, fn: () => Promise<T> | T) => await fn(),
      } as unknown as Parameters<typeof discordExecutor>[0]["step"];

      await assert.rejects(
        () =>
          discordExecutor({
            data: {
              webhookUrl: "http://169.254.169.254/latest/meta-data/",
              content: "Hello",
              variableName: "discordRes",
            },
            nodeId: "node-discord-1",
            userId: "user-123",
            context: {},
            step: mockStep,
            publish: mockPublish,
          }),
        /Access to private or reserved IP address '169.254.169.254' is forbidden/,
      );

      await assert.rejects(
        () =>
          slackExecutor({
            data: {
              webhookUrl: "http://127.0.0.1:8080/internal-admin",
              content: "Hello",
              variableName: "slackRes",
            },
            nodeId: "node-slack-1",
            userId: "user-123",
            context: {},
            step: mockStep,
            publish: mockPublish,
          }),
        /Access to private or reserved IP address '127.0.0.1' is forbidden/,
      );
    });
  });
});
