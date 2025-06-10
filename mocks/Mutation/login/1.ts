import { GraphQLError } from "graphql";

export default () => {
  throw new GraphQLError("Invalid credentials");
};
