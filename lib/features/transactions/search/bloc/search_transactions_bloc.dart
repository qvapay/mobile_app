import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:bloc_concurrency/bloc_concurrency.dart';
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';

import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/repository/transactions_repository.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

part 'search_transactions_event.dart';
part 'search_transactions_state.dart';

enum TransactionFilterOption { none, all, send, receive }

class SearchTransactionsBloc
    extends Bloc<SearchTransactionsEvent, SearchTransactionsState> {
  SearchTransactionsBloc({
    required ITransactionsRepository transactionRepository,
  })  : _transactionRepository = transactionRepository,
        super(const SearchTransactionsState()) {
    on<SearchTransactionsEvent>(
      _onSearchTransactions,
      transformer: sequential(),
    );
  }

  FutureOr<void> _onSearchTransactions(
    SearchTransactionsEvent event,
    Emitter<SearchTransactionsState> emit,
  ) async {
    if (event is ActiveDeactiveFilter) {
      _onActiveDeactiveFilter(event, emit);
    } else if (event is GetAllTransactions) {
      await _onGetAllTransactions(event, emit);
    } else if (event is SearchTermChanged) {
      await _onSearchTermChanged(event, emit);
    } else if (event is ChangeFilterSelect) {
      _onChangeFilterSelect(event, emit);
    } else if (event is CleanFilter) {
      _onCleanFilter(event, emit);
    }
  }

  final ITransactionsRepository _transactionRepository;

  static const debounceSearchTermDuration = Duration(milliseconds: 400);

  var _filterCache = <UserTransaction>[];
  var _filterSearch = <UserTransaction>[];

  void _onChangeFilterSelect(ChangeFilterSelect event, Emitter emit) {
    switch (event.select) {
      case TransactionFilterOption.send:
        emit(state.copyWith(
          filterIndex: event.widthFilterLabel,
          filterOptionSelect: TransactionFilterOption.send,
          transactions: [
            if (state.isFilterActive)
              ..._filterSearch.where((transaction) => transaction.isSend),
            if (state.isFilterActive && state.searchTerm.pure)
              ..._filterCache.where((transaction) => transaction.isSend),
          ],
        ));

        break;
      case TransactionFilterOption.receive:
        emit(state.copyWith(
          filterIndex: event.widthFilterLabel,
          filterOptionSelect: TransactionFilterOption.receive,
          transactions: [
            if (state.isFilterActive)
              ..._filterSearch.where((transaction) => transaction.isReceive),
            if (state.isFilterActive && state.searchTerm.pure)
              ..._filterCache.where((transaction) => transaction.isReceive),
          ],
        ));
        break;
      case TransactionFilterOption.all:
        emit(state.copyWith(
          filterIndex: event.widthFilterLabel,
          filterOptionSelect: TransactionFilterOption.all,
          transactions: [
            if (state.isFilterActive) ..._filterSearch,
            if (state.isFilterActive && state.searchTerm.pure) ..._filterCache,
          ],
        ));
        break;

      case TransactionFilterOption.none:
        break;
    }
  }

  void _onActiveDeactiveFilter(ActiveDeactiveFilter event, Emitter emit) {
    final filter = state.isFilterActive
        ? TransactionFilterOption.none
        : TransactionFilterOption.all;

    if (state.searchTerm.pure && state.isFilterActive) {
      return emit(state.copyWith(
        filterIndex: 0,
        filterOptionSelect: filter,
        transactions: [..._filterCache],
      ));
    }
    emit(state.copyWith(filterOptionSelect: filter));
  }

  FutureOr<void> _onGetAllTransactions(
    GetAllTransactions event,
    Emitter<SearchTransactionsState> emit,
  ) async {
    emit(state.copyWith(status: FormzStatus.submissionInProgress));

    final userTransactions =
        await _transactionRepository.getLatestTransactions();

    emit(userTransactions.fold(
        (error) => state.copyWith(
              errorMessage: (error as ServerFailure).message,
              status: FormzStatus.submissionFailure,
            ), (transactions) {
      _filterCache = transactions;
      return state.copyWith(
        status: FormzStatus.submissionSuccess,
        transactions: [...transactions],
      );
    }));
  }

  FutureOr<void> _onSearchTermChanged(
    SearchTermChanged event,
    Emitter<SearchTransactionsState> emit,
  ) async {
    final searchTerm = NameFormz.dirty(event.searchTerm);
    emit(
      state.copyWith(
        searchTerm: searchTerm,
        status: FormzStatus.submissionInProgress,
      ),
    );
    if (searchTerm.valid) {
      final userTransactions = await _transactionRepository
          .getLatestTransactions(searchTerm: event.searchTerm);

      emit(
        userTransactions.fold(
          (e) => state.copyWith(
            errorMessage: (e as ServerFailure).message,
            status: FormzStatus.submissionFailure,
          ),
          (transactions) {
            _filterSearch = transactions;
            return state.copyWith(
              searchTerm: searchTerm,
              status: FormzStatus.submissionSuccess,
              transactions: [...transactions],
            );
          },
        ),
      );

      if (state.isFilterActive &&
          state.filterOptionSelect != TransactionFilterOption.all) {
        add(ChangeFilterSelect(
          select: state.filterOptionSelect,
          widthFilterLabel: state.filterIndex,
        ));
      }
    }
  }

  FutureOr<void> _onCleanFilter(
    CleanFilter event,
    Emitter<SearchTransactionsState> emit,
  ) {
    _filterSearch.clear();
    emit(
      state.copyWith(
        searchTerm: const NameFormz.pure(),
        transactions: [for (var x in _filterCache) x],
        filterOptionSelect: TransactionFilterOption.all,
        filterIndex: 0,
      ),
    );
  }
}
