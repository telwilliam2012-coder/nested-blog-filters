import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { BlogHome, type BlogOverview } from "../components/blog-home";
import { getFilterHomeOverview } from "../services/filter-home.server";
import { authenticate } from "../shopify.server";

type OverviewResponse = {
  data?: {
    shop: { name: string; primaryDomain: { url: string } };
    blogs: {
      nodes: BlogOverview["blogs"];
      pageInfo: { hasNextPage: boolean };
    };
  };
  errors?: Array<{ message: string }>;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Keep the local filter summary available even if Shopify's overview fails.
  const filtersPromise = getFilterHomeOverview(session.shop).catch((error) => {
    console.error("Unable to load the filter home overview.", error);
    return null;
  });

  try {
    const response = await admin.graphql(`#graphql
      query BlogHomeOverview {
        shop {
          name
          primaryDomain { url }
        }
        blogs(first: 50) {
          nodes {
            id
            title
            handle
            articlesCount { count precision }
            tags
          }
          pageInfo { hasNextPage }
        }
      }
    `);
    const result = (await response.json()) as OverviewResponse;

    if (result.errors?.length || !result.data?.shop || !result.data.blogs) {
      throw new Error("Shopify did not return a complete blog overview.");
    }

    const overview: BlogOverview = {
      shopName: result.data.shop.name,
      storefrontUrl: result.data.shop.primaryDomain.url,
      blogs: result.data.blogs.nodes,
      hasMore: result.data.blogs.pageInfo.hasNextPage,
    };

    return { overview, shop: session.shop, filters: await filtersPromise };
  } catch (error) {
    // Authentication responses must reach Shopify's route boundary.
    if (error instanceof Response) throw error;
    console.error("Unable to load the blog home overview.", error);
    return {
      overview: null,
      shop: session.shop,
      filters: await filtersPromise,
    };
  }
}

export default function Index() {
  const { overview, shop, filters } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <BlogHome
      overview={overview}
      filters={filters}
      shop={shop}
      refreshing={revalidator.state === "loading"}
      onRefresh={() => revalidator.revalidate()}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
