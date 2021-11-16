part of 'search_transactions_bloc.dart';

class SearchTransactionsState extends Equatable {
  const SearchTransactionsState({
    this.filterIndex = 0,
    this.isFilterActive = false,
    this.filterOptionSelect = TransactionFilterOption.all,
    this.isSearchTransactions = false,
    this.searchTerm = const NameFormz.pure(),
    this.transactions = const <UserTransaction>[],
    this.errorMessage,
  });

  final double filterIndex;
  final bool isFilterActive;
  final TransactionFilterOption filterOptionSelect;
  final bool isSearchTransactions;
  final NameFormz searchTerm;
  final List<UserTransaction> transactions;
  final String? errorMessage;

  @override
  List<Object?> get props {
    return [
      filterIndex,
      isFilterActive,
      filterOptionSelect,
      isSearchTransactions,
      searchTerm,
      transactions,
      errorMessage,
    ];
  }

  SearchTransactionsState copyWith({
    double? filterIndex,
    bool? isFilterActive,
    TransactionFilterOption? filterOptionSelect,
    bool? isSearchTransactions,
    NameFormz? searchTerm,
    List<UserTransaction>? transactions,
    String? errorMessage,
  }) {
    return SearchTransactionsState(
      filterIndex: filterIndex ?? this.filterIndex,
      isFilterActive: isFilterActive ?? this.isFilterActive,
      filterOptionSelect: filterOptionSelect ?? this.filterOptionSelect,
      isSearchTransactions: isSearchTransactions ?? this.isSearchTransactions,
      searchTerm: searchTerm ?? this.searchTerm,
      transactions: transactions ?? this.transactions,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
