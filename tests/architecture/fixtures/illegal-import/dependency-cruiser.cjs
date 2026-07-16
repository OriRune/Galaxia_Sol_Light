module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/app" },
    },
  ],
  options: {},
};
