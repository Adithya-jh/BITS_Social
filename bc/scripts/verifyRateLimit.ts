import 'dotenv/config';

const target = process.env.RATE_TEST_URL ?? 'http://localhost:8080/api/feed/get-feed-page?type=For%20You';
const total = Number(process.env.RATE_TEST_REQUESTS ?? 60);
const delay = Number(process.env.RATE_TEST_DELAY_MS ?? 100);

async function run() {
  console.log(`Testing rate limit against ${target}`);
  console.log(`Total requests: ${total}, delay between requests: ${delay}ms`);

  for (let i = 1; i <= total; i++) {
    try {
      const res = await fetch(target, {
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.RATE_TEST_TOKEN
            ? { Authorization: `Bearer ${process.env.RATE_TEST_TOKEN}` }
            : {}),
        },
      });

      console.log(`#${i} -> ${res.status}`);
      if (res.status === 429) {
        const body = await res.text();
        console.log('Rate limit reached! Response body:', body);
        break;
      }
    } catch (err) {
      console.error(`#${i} -> Request failed`, err);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

run();
