import Map "mo:core/Map";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";

actor {
  let watchlists = Map.empty<Principal, [Text]>();
  let settings = Map.empty<Text, Text>();

  public shared ({ caller }) func updateWatchlist(pairs : [Text]) : async () {
    if (pairs.size() == 0) { Runtime.trap("Watchlist cannot be empty") };
    watchlists.add(caller, pairs);
  };

  public query ({ caller }) func getWatchlist() : async [Text] {
    switch (watchlists.get(caller)) {
      case (null) { Runtime.trap("Watchlist not found: " # caller.toText()) };
      case (?pairs) { pairs };
    };
  };

  public shared ({ caller }) func setSetting(key : Text, value : Text) : async () {
    settings.add(key, value);
  };

  public query ({ caller }) func getSetting(key : Text) : async Text {
    switch (settings.get(key)) {
      case (null) { Runtime.trap("Setting not found: " # key) };
      case (?value) { value };
    };
  };
};
