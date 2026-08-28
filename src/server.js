const { app } = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  // Minimal startup log; no extra functionality
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});
