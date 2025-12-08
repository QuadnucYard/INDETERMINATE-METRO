import type { RawEntry } from "./types";

const UID = "2638276292";
const QUERY = ""; // Empty query to get all posts

interface WeiboResponse {
  ok: number;
  data: {
    list: {
      created_at: string;
      text_raw: string;
    }[];
  };
}

async function fetchPage(
  page: number,
  cookie: string,
  startTime?: number,
  endTime?: number,
): Promise<WeiboResponse> {
  const url = new URL("https://weibo.com/ajax/statuses/searchProfile");
  url.searchParams.set("uid", UID);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("q", QUERY);
  url.searchParams.set("hasori", "1");
  url.searchParams.set("hastext", "1");
  url.searchParams.set("haspic", "1");
  url.searchParams.set("hasvideo", "1");
  url.searchParams.set("hasmusic", "1");
  url.searchParams.set("hasret", "1");

  if (startTime) {
    url.searchParams.set("starttime", startTime.toString());
  }
  if (endTime) {
    url.searchParams.set("endtime", endTime.toString());
  }

  console.log(`Fetching page ${page}...`);

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Referer: `https://weibo.com/u/${UID}`,
  };

  if (cookie) {
    headers["Cookie"] = cookie;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }

  return res.json() as Promise<WeiboResponse>;
}

export async function crawl(
  {
    maxPages = 50,
    startTime,
    endTime,
  }: { maxPages?: number; startTime?: number; endTime?: number },
  {
    cookie,
    stopOnExist,
  }: {
    cookie: string;
    stopOnExist: boolean;
  },
  existingDates: Set<string>,
) {
  const newEntries: RawEntry[] = [];
  let page = 1;
  let stop = false;

  while (!stop && page <= maxPages) {
    try {
      const json = await fetchPage(page, cookie, startTime, endTime);

      if (!json.ok) {
        console.error("API returned not ok:", json);
        break;
      }

      const list = json.data?.list;
      if (!list || list.length === 0) {
        console.log("No more data found.");
        break;
      }

      for (const item of list) {
        const date = item.created_at;
        const content = item.text_raw;

        if (existingDates.has(date)) {
          if (stopOnExist) {
            stop = true;
          }
          continue; // default: skip duplicate and continue
        }

        // Double check if we already added it in this run (unlikely but possible)
        if (!newEntries.find((e) => e.date === date)) {
          newEntries.push({ date, content });
        }
      }

      if (stop) {
        console.log("Stopping fetch as requested.");
        break;
      }

      page++;

      // Random delay
      const delay = 500 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    } catch (e) {
      console.error(`Error fetching page ${page}:`, e);
      break;
    }
  }

  return newEntries;
}
