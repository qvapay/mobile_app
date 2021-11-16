part of 'search_transactions_bloc.dart';

abstract class SearchTransactionsEvent extends Equatable {
  const SearchTransactionsEvent();
}

class GetAllTransactions extends SearchTransactionsEvent {
  const GetAllTransactions();

  @override
  List<Object?> get props => [];
}

class ChangeFilterSelect extends SearchTransactionsEvent {
  const ChangeFilterSelect({required this.select});

  final TransactionFilterOption select;
  @override
  List<Object?> get props => [select];
}

class ActiveDeactiveFilter extends SearchTransactionsEvent {
  const ActiveDeactiveFilter();

  @override
  List<Object?> get props => [];
}

class SearchTermChanged extends SearchTransactionsEvent {
  const SearchTermChanged({required this.searchTerm});

  final String searchTerm;

  @override
  List<Object?> get props => [searchTerm];
}

class CleanFilter extends SearchTransactionsEvent {
  const CleanFilter();

  @override
  List<Object?> get props => [];
}
