import { GraphQLError } from "graphql";

export default () => {
  throw new GraphQLError("User not found");
};
