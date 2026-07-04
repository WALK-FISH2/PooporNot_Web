package com.poopornot.wheretopoop.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.poopornot.wheretopoop.R
import com.poopornot.wheretopoop.databinding.ItemResultBinding
import com.poopornot.wheretopoop.model.ResultKind
import com.poopornot.wheretopoop.model.ResultRow

class ResultAdapter(
    private val onSelect: (ResultRow) -> Unit,
    private val onPrimary: (ResultRow) -> Unit,
    private val onNavigate: (ResultRow) -> Unit,
) : RecyclerView.Adapter<ResultAdapter.ResultViewHolder>() {
    private val items = mutableListOf<ResultRow>()

    fun submitList(newItems: List<ResultRow>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ResultViewHolder {
        val binding = ItemResultBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ResultViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ResultViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    inner class ResultViewHolder(
        private val binding: ItemResultBinding,
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(item: ResultRow) = with(binding) {
            titleText.text = item.title
            subtitleText.text = item.subtitle.ifBlank { "暂无地址" }
            metaText.text = item.meta

            val isPlace = item.kind == ResultKind.PLACE
            primaryButton.text = if (isPlace) "选定" else "路线"
            navigateButton.visibility = if (isPlace) View.GONE else View.VISIBLE
            statusDot.visibility = if (item.kind == ResultKind.METRO) View.VISIBLE else View.GONE
            statusDot.setBackgroundResource(
                when (item.toiletStatus) {
                    1 -> R.drawable.bg_dot_green
                    0 -> R.drawable.bg_dot_red
                    else -> R.drawable.bg_dot_gray
                },
            )

            root.setOnClickListener { onSelect(item) }
            primaryButton.setOnClickListener { onPrimary(item) }
            navigateButton.setOnClickListener { onNavigate(item) }
        }
    }
}

