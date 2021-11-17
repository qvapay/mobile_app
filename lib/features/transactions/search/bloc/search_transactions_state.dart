part of 'search_transactions_bloc.dart';

class SearchTransactionsState extends Equatable {
  const SearchTransactionsState({
    this.filterIndex = 0,
    this.filterOptionSelect = TransactionFilterOption.none,
    this.isSearchTransactions = false,
    this.searchTerm = const NameFormz.pure(),
    this.transactions = const <UserTransaction>[],
    this.errorMessage,
  });

  final double filterIndex;
  final TransactionFilterOption filterOptionSelect;
  final bool isSearchTransactions;
  final NameFormz searchTerm;
  final List<UserTransaction> transactions;
  final String? errorMessage;

  @override
  List<Object?> get props {
    return [
      filterIndex,
      filterOptionSelect,
      isSearchTransactions,
      searchTerm,
      transactions,
      errorMessage,
    ];
  }

  bool get isFilterActive => filterOptionSelect != TransactionFilterOption.none;

  SearchTransactionsState copyWith({
    double? filterIndex,
    TransactionFilterOption? filterOptionSelect,
    bool? isSearchTransactions,
    NameFormz? searchTerm,
    List<UserTransaction>? transactions,
    String? errorMessage,
  }) {
    return SearchTransactionsState(
      filterIndex: filterIndex ?? this.filterIndex,
      filterOptionSelect: filterOptionSelect ?? this.filterOptionSelect,
      isSearchTransactions: isSearchTransactions ?? this.isSearchTransactions,
      searchTerm: searchTerm ?? this.searchTerm,
      transactions: transactions ?? this.transactions,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
